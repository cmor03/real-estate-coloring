import { NextRequest, NextResponse } from 'next/server';
import { auth } from 'firebase-admin';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { getStorage } from 'firebase-admin/storage';
import { db } from '../../../firebase/firebaseAdmin';
import { Transaction } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('Storage bucket name is not defined in environment variables');
  }
  
  console.log('Environment variables:', {
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    selectedBucket: bucketName
  });
  
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    storageBucket: bucketName,
  });
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Firebase Storage
const storage = getStorage();
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  throw new Error('Storage bucket name is not defined in environment variables');
}

console.log('Attempting to access bucket:', bucketName);
const bucket = storage.bucket(bucketName);

// Test bucket access
try {
  const [exists] = await bucket.exists();
  console.log('Bucket exists check:', exists);
} catch (error) {
  console.error('Error checking bucket:', error);
}

// Add debug logging
console.log('Using storage bucket:', bucketName);

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check if user has enough credits
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userDoc.data();
    const credits = userData?.credits || 0;
    
    // Each coloring page costs 4 credits
    const requiredCredits = 4;
    
    if (credits < requiredCredits) {
      return NextResponse.json({ 
        error: 'Insufficient credits', 
        message: `You need ${requiredCredits} credits to generate a coloring page. You currently have ${credits} credits.`,
        requiredCredits,
        currentCredits: credits
      }, { status: 402 }); // 402 Payment Required
    }

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const address = formData.get('address') as string || 'Unnamed Property';

    if (!imageFile) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    // Convert File to Buffer
    const buffer = Buffer.from(await imageFile.arrayBuffer());

    // Upload image to Firebase Storage
    const imageFileName = `uploads/${userId}/${uuidv4()}-${imageFile.name}`;
    const imageFileRef = bucket.file(imageFileName);
    await imageFileRef.save(buffer, {
      metadata: {
        contentType: imageFile.type,
      },
    });

    // Get public URL for the uploaded image
    await imageFileRef.makePublic();
    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${imageFileName}`;

    // Step 1: Use ChatGPT to generate a detailed description of the image
    const imageDescriptionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Provide an extremely detailed description of this real estate image. Focus on all architectural details, colors, textures, landscaping, and any unique features. Be as specific as possible. This will be fed into another model, so you must not leave out a single detail needed to reconstruct the picture from text. Be sure to maintain the number and positions of doors. Use all 4000 characters you have to generate this description. Include things like camera angle so that the image can be reconstructed exactly." },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 4000,
    });

    const imageDescription = imageDescriptionResponse.choices[0].message.content;

    // Step 2: Use DALL-E to generate a coloring book version
    const coloringBookPrompt = `Create a coloring book style illustration of a real estate property based on this description: ${imageDescription}. 
    The image should be in a clean, simple line art style suitable for children to color in. YOU MUST HAVE INTENSE ATTENTION TO DETAIL. MAKE IT EXACTLY AS DESCRIBED AS A COLORING BOOK. 
    Include clear outlines with no shading or complex textures. 
    Make it look like a professional coloring book page with clean lines and appropriate level of detail.`;

    const dalleResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: coloringBookPrompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
    });

    const coloringBookImageUrl = dalleResponse.data[0].url;
    
    if (!coloringBookImageUrl) {
      throw new Error('Failed to generate coloring book image');
    }

    // Step 3: Download the DALL-E image and upload to Firebase Storage
    const coloringBookResponse = await fetch(coloringBookImageUrl);
    const coloringBookBuffer = Buffer.from(await coloringBookResponse.arrayBuffer());

    const coloringBookFileName = `colorings/${userId}/${uuidv4()}-coloring.png`;
    const coloringBookFileRef = bucket.file(coloringBookFileName);
    await coloringBookFileRef.save(coloringBookBuffer, {
      metadata: {
        contentType: 'image/png',
      },
    });

    // Get public URL for the coloring book image
    await coloringBookFileRef.makePublic();
    const coloringBookPublicUrl = `https://storage.googleapis.com/${bucket.name}/${coloringBookFileName}`;

    // Deduct credits from user
    await db.runTransaction(async (transaction: Transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) {
        throw new Error('User document does not exist');
      }

      const currentCredits = userDoc.data()?.credits || 0;
      transaction.update(userRef, {
        credits: currentCredits - requiredCredits,
        updatedAt: new Date(),
      });
    });

    return NextResponse.json({
      url: coloringBookPublicUrl,
      description: imageDescription,
      address: address,
      creditsRemaining: credits - requiredCredits,
    });
  } catch (error) {
    console.error('Error in generate API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 