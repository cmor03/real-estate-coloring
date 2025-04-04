# Real Estate Coloring Book Generator

A web application that allows users to upload real estate images and convert them into coloring book pages using AI.

## Features

- User authentication with Firebase
- Image upload and processing
- AI-powered image analysis with GPT-4 Vision
- Coloring book generation with DALL-E 3
- User credit system
- Library of generated colorings

## Tech Stack

- Next.js 14 (App Router)
- Firebase (Authentication, Firestore, Storage)
- OpenAI API (GPT-4 Vision, DALL-E 3)
- Tailwind CSS

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up environment variables in `.env.local`:
   ```
   # Firebase Configuration
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

   # Firebase Admin SDK
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_CLIENT_EMAIL=your_client_email
   FIREBASE_PRIVATE_KEY=your_private_key
   FIREBASE_STORAGE_BUCKET=your_storage_bucket

   # OpenAI API
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the development server:
   ```
   npm run dev
   ```

## How It Works

1. User uploads a real estate image
2. The image is analyzed by GPT-4 Vision to generate a detailed description
3. The description is used by DALL-E 3 to create a coloring book style illustration
4. The generated coloring is saved to the user's library
5. User credits are deducted for each generation

## Firebase Setup

1. Create a Firebase project
2. Enable Authentication, Firestore, and Storage
3. Set up Firestore security rules
4. Create a service account for Firebase Admin SDK

## OpenAI Setup

1. Create an OpenAI account
2. Generate an API key
3. Ensure you have access to GPT-4 Vision and DALL-E 3

## License

MIT
