import { firestore } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import Stripe from 'stripe';

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Disable the default body parser to handle raw body for Stripe webhook
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;

  try {
    // Get the raw body as a buffer
    const rawBody = await getRawBody(req);
    
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Retrieve the session from Firestore
        const sessionDoc = await getDoc(doc(firestore, 'payment_sessions', session.id));
        
        if (!sessionDoc.exists()) {
          console.error(`Payment session ${session.id} not found in Firestore`);
          return res.status(200).json({ received: true });
        }
        
        const sessionData = sessionDoc.data();
        const { userId, credits } = sessionData;
        
        // Update the session status
        await updateDoc(doc(firestore, 'payment_sessions', session.id), {
          status: 'completed',
          completedAt: new Date(),
          stripeSessionId: session.id
        });
        
        // Get the user document
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        
        if (!userDoc.exists()) {
          console.error(`User ${userId} not found in Firestore`);
          return res.status(200).json({ received: true });
        }
        
        const userData = userDoc.data();
        const currentCredits = userData.credits || 0;
        
        // Update the user's credits
        await setDoc(doc(firestore, 'users', userId), {
          credits: currentCredits + credits,
          subscription: sessionData.plan,
          updatedAt: new Date()
        }, { merge: true });
        
        // Create a transaction record
        await setDoc(doc(firestore, 'transactions', session.id), {
          userId,
          amount: sessionData.amount,
          credits,
          plan: sessionData.plan,
          status: 'completed',
          createdAt: new Date()
        });
        
        break;
      }
      
      case 'payment_intent.succeeded':
        // Handle successful payment intent
        break;
        
      case 'payment_intent.payment_failed':
        // Handle failed payment intent
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Error processing webhook' });
  }
}

// Helper function to get raw body
async function getRawBody(req) {
  const chunks = [];
  
  return new Promise((resolve, reject) => {
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
} 