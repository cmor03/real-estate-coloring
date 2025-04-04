# Stripe Setup Instructions

To complete the Stripe integration, you need to:

1. Create a Stripe account at https://stripe.com if you don't have one already.

2. Create a product and price in Stripe:
   - Go to the Stripe Dashboard > Products
   - Create a new product called "Coloring Credits"
   - Add a price of $10 for 20 credits
   - Note the price ID (it should look like `price_XXXXXX`)

3. Update your `.env.local` file with the following variables:
   ```
   STRIPE_SECRET_KEY=sk_test_...  # Your Stripe secret key
   STRIPE_WEBHOOK_SECRET=whsec_... # Your Stripe webhook secret
   NEXT_PUBLIC_BASE_URL=http://localhost:3000  # Your app's URL
   ```

4. Set up a webhook in Stripe:
   - Go to the Stripe Dashboard > Developers > Webhooks
   - Add an endpoint: `https://your-domain.com/api/webhook`
   - Select the event: `checkout.session.completed`
   - Get the webhook signing secret and add it to your `.env.local` file

5. For local development, you can use the Stripe CLI to forward webhooks to your local environment:
   ```
   stripe listen --forward-to localhost:3000/api/webhook
   ```

Once you've completed these steps, the credit system will be fully functional. 