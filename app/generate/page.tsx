'use client';

import { useState, useEffect, FormEvent, useRef } from 'react';
import { auth, db } from '@/app/firebase/config';
import { storage } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function GeneratePage() {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credits, setCredits] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processingStep, setProcessingStep] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Check authentication and fetch user data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await fetchUserData(user.uid);
      } else {
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const fetchUserData = async (userId: string) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setCredits(userDoc.data().credits || 0);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (credits < 4) {
      setError('You need at least 4 credits to generate a coloring page. Please buy more credits.');
      return;
    }
    
    if (!selectedImage) {
      setError('Please select an image to upload.');
      return;
    }
    
    setLoading(true);
    setError('');
    setProcessingStep('Uploading image...');
    
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('You must be logged in to generate a coloring');
      }
      
      // Get the auth token
      const token = await user.getIdToken();
      
      // Create FormData to send the image
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('address', address || 'Unnamed Property');
      formData.append('userId', user.uid);
      
      // Call your API to generate the coloring
      setProcessingStep('Analyzing image with AI...');
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        if (response.status === 402) {
          // Payment Required - Insufficient credits
          setError(errorData.message || 'Insufficient credits. Please buy more credits to continue.');
          setLoading(false);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to generate coloring page');
      }
      
      const data = await response.json();
      
      // Update credits in state
      setCredits(data.creditsRemaining);
      
      // Save the coloring to Firestore
      setProcessingStep('Saving your coloring page...');
      await addDoc(collection(db, 'colorings'), {
        userId: user.uid,
        url: data.url,
        address: data.address,
        description: data.description,
        createdAt: new Date(),
      });
      
      // Set the generated image
      setGeneratedImage(data.url);
      setProcessingStep(null);
      
      // Reset form
      setSelectedImage(null);
      setPreviewUrl(null);
      setAddress('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error generating coloring:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while generating the coloring page');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Generate a Coloring Page</h1>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-800">Your Credits: {credits}</p>
                  <p className="text-sm text-blue-600">Each coloring page costs 4 credits</p>
                </div>
                {credits < 4 && (
                  <Link 
                    href="/dashboard" 
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Buy Credits
                  </Link>
                )}
              </div>
            </div>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            <div className="bg-white shadow rounded-lg p-6">
              <form onSubmit={handleSubmit}>
                {processingStep && (
                  <div className="mb-4 rounded-md bg-blue-50 p-4">
                    <div className="text-sm text-blue-700">{processingStep}</div>
                  </div>
                )}
                
                <div className="mb-6">
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                    Property Address (Optional)
                  </label>
                  <input
                    type="text"
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                    placeholder="123 Main St, Anytown, USA"
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    Enter the address of the property (optional).
                  </p>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload Property Image
                  </label>
                  <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                      {previewUrl ? (
                        <div className="relative h-64 w-full mb-4">
                          <Image 
                            src={previewUrl} 
                            alt="Preview" 
                            fill
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          stroke="currentColor"
                          fill="none"
                          viewBox="0 0 48 48"
                          aria-hidden="true"
                        >
                          <path
                            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                        >
                          <span>Upload a file</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            className="sr-only"
                            accept="image/*"
                            onChange={handleImageChange}
                            ref={fileInputRef}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                    </div>
                  </div>
                </div>
                
                {generatedImage && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Generated Coloring</h3>
                    <div className="relative h-64 w-full">
                      <Image 
                        src={generatedImage} 
                        alt="Generated Coloring" 
                        fill
                        className="object-contain"
                      />
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-primary-600 hover:text-primary-500"
                  >
                    Back to Dashboard
                  </Link>
                  <button
                    type="submit"
                    disabled={loading || credits < 4 || !selectedImage}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processing...' : 'Generate Coloring'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 