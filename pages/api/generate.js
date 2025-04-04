import { firestore, storage, auth } from '../../lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { ref, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Disable the default body parser to handle form data
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data
    const form = formidable({ 
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB max file size
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const { userId, address, token } = fields;
    const imageFile = files.image;

    if (!userId || !token) {
      return res.status(400).json({ error: 'User ID and token are required' });
    }

    // Validate the Firebase token
    try {
      const decodedToken = await auth.verifyIdToken(token);
      if (decodedToken.uid !== userId) {
        return res.status(403).json({ error: 'Invalid token' });
      }
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // Check if user exists and has credits
    const userDoc = await getDoc(doc(firestore, 'users', userId));
    
    if (!userDoc.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    if (userData.credits <= 0) {
      return res.status(403).json({ error: 'Insufficient credits' });
    }

    // Process the uploaded image
    let originalImageUrl = null;
    if (imageFile) {
      const fileBuffer = fs.readFileSync(imageFile.filepath);
      const fileExtension = path.extname(imageFile.originalFilename || 'image.jpg');
      const fileName = `${uuidv4()}${fileExtension}`;
      const imageRef = ref(storage, `uploads/${userId}/${fileName}`);
      
      await uploadBytes(imageRef, fileBuffer, {
        contentType: imageFile.mimetype || 'image/jpeg',
      });
      
      originalImageUrl = await getDownloadURL(imageRef);
    }

    // Call the image generation model
    // In a real app, you would integrate with an AI service here
    // For example, using OpenAI's DALL-E or similar service
    let generatedImageUrl;
    
    try {
      // This is a placeholder for the actual API call to an image generation service
      // In a real implementation, you would call something like:
      // const response = await fetch('https://api.openai.com/v1/images/generations', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      //   },
      //   body: JSON.stringify({
      //     prompt: `Create a coloring page of a real estate property at ${address || 'a generic location'}`,
      //     n: 1,
      //     size: "1024x1024"
      //   })
      // });
      // const data = await response.json();
      // generatedImageUrl = data.data[0].url;
      
      // For now, we'll create a placeholder SVG
      const placeholderImage = `data:image/svg+xml;base64,${Buffer.from(`
        <svg width="500" height="500" xmlns="http://www.w3.org/2000/svg">
          <rect width="500" height="500" fill="#f0f0f0"/>
          <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#999" text-anchor="middle" dy=".3em">
            Property at ${address || '123 Main St, Anytown, USA'}
          </text>
          <rect x="100" y="100" width="300" height="200" fill="none" stroke="#999" stroke-width="2"/>
          <rect x="150" y="150" width="50" height="50" fill="none" stroke="#999" stroke-width="2"/>
          <rect x="250" y="150" width="50" height="50" fill="none" stroke="#999" stroke-width="2"/>
          <rect x="150" y="250" width="50" height="50" fill="none" stroke="#999" stroke-width="2"/>
          <rect x="250" y="250" width="50" height="50" fill="none" stroke="#999" stroke-width="2"/>
        </svg>
      `).toString('base64')}`;
      
      // Upload the generated image to Firebase Storage
      const imageRef = ref(storage, `colorings/${userId}/${Date.now()}.svg`);
      await uploadString(imageRef, placeholderImage, 'data_url');
      generatedImageUrl = await getDownloadURL(imageRef);
    } catch (error) {
      console.error('Error generating image:', error);
      return res.status(500).json({ error: 'Failed to generate coloring image' });
    }
    
    // Create a new coloring document in Firestore
    const coloringData = {
      userId,
      address: address || '123 Main St, Anytown, USA',
      originalImageUrl,
      url: generatedImageUrl,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const docRef = await addDoc(collection(firestore, 'colorings'), coloringData);
    
    // Update user credits
    await setDoc(doc(firestore, 'users', userId), {
      credits: userData.credits - 1,
      updatedAt: new Date()
    }, { merge: true });
    
    // Clean up temporary files
    if (imageFile && imageFile.filepath) {
      fs.unlinkSync(imageFile.filepath);
    }
    
    return res.status(200).json({
      id: docRef.id,
      url: generatedImageUrl,
      originalImageUrl,
      address: coloringData.address,
      creditsRemaining: userData.credits - 1
    });
  } catch (error) {
    console.error('Error generating coloring:', error);
    return res.status(500).json({ error: 'Failed to generate coloring' });
  }
} 