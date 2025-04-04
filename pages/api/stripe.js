import { firestore, auth } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, token, plan } = req.body;

    if (!userId || !token || !plan) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(token);
    if (decodedToken.uid !== userId) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    // Check if user exists
    const userRef = doc(firestore, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Define subscription plans
    const plans = {
      basic: {
        price: 999, // $9.99
        credits: 5,
        name: 'Basic Plan'
      },
      premium: {
        price: 2999, // $29.99
        credits: 20,
        name: 'Premium Plan'
      }
    };

    if (!plans[plan]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const selectedPlan = plans[plan];

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: selectedPlan.name,
              description: `${selectedPlan.credits} coloring credits`,
            },
            unit_amount: selectedPlan.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?canceled=true`,
      metadata: {
        userId,
        plan,
        credits: selectedPlan.credits
      },
    });

    // Store session info in Firestore
    await setDoc(doc(firestore, 'payment_sessions', session.id), {
      userId,
      plan,
      credits: selectedPlan.credits,
      amount: selectedPlan.price,
      status: 'pending',
      createdAt: new Date()
    });

    return res.status(200).json({ 
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
} 