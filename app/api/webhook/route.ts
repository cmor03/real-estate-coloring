import { NextRequest, NextResponse } from 'next/server';
import { db } from '../../../firebase/firebaseAdmin';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil',
});

// Define credit amounts for different price IDs
const CREDIT_AMOUNTS: Record<string, number> = {
  'price_20credits': 20, // $10 for 20 credits
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature provided' }, { status: 400 });
  }

  try {
    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Get the user ID from the session metadata
      const userId = session.metadata?.userId;
      if (!userId) {
        console.error('No user ID found in session metadata');
        return NextResponse.json({ error: 'No user ID found' }, { status: 400 });
      }

      // Get the price ID from the line items
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      if (!lineItems.data.length) {
        console.error('No line items found in session');
        return NextResponse.json({ error: 'No line items found' }, { status: 400 });
      }

      const priceId = lineItems.data[0].price?.id;
      if (!priceId) {
        console.error('No price ID found in line item');
        return NextResponse.json({ error: 'No price ID found' }, { status: 400 });
      }

      // Get the credit amount for this price ID
      const creditAmount = CREDIT_AMOUNTS[priceId];
      if (!creditAmount) {
        console.error(`No credit amount defined for price ID: ${priceId}`);
        return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
      }

      // Update the user's credits in Firestore
      const userRef = db.collection('users').doc(userId);
      await db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
          throw new Error('User document does not exist');
        }

        const currentCredits = userDoc.data()?.credits || 0;
        transaction.update(userRef, {
          credits: currentCredits + creditAmount,
          updatedAt: new Date(),
        });
      });

      console.log(`Added ${creditAmount} credits to user ${userId}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 