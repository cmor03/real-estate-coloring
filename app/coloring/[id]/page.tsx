'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/app/firebase/config';
import Image from 'next/image';
import Link from 'next/link';

interface ColoringData {
  url: string;
  address: string;
  // Add other fields if needed
}

export default function ColoringPage() {
  const [coloring, setColoring] = useState<ColoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string | undefined;

  useEffect(() => {
    if (!id) {
      setError('No coloring page ID provided.');
      setLoading(false);
      return;
    }

    const fetchColoring = async () => {
      setLoading(true);
      setError(null);
      try {
        const coloringRef = doc(db, 'colorings', id);
        const docSnap = await getDoc(coloringRef);

        if (docSnap.exists()) {
          setColoring(docSnap.data() as ColoringData);
        } else {
          setError('Coloring page not found.');
        }
      } catch (err) {
        console.error('Error fetching coloring page:', err);
        setError('Failed to load coloring page.');
      } finally {
        setLoading(false);
      }
    };

    fetchColoring();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  if (!coloring) {
    // This case should ideally be covered by error state, but added for robustness
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <p className="text-gray-600 mb-4">Coloring page data not available.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white shadow rounded-lg overflow-hidden">
        {/* Header with Back Button and Title */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={() => router.back()} // Use router.back() for more flexible history navigation
            className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium"
          >
            {/* Back Icon SVG */}
            <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Back
          </button>
          <h1 className="text-lg font-semibold text-gray-800 truncate px-2" title={coloring.address}>
            {coloring.address || 'Coloring Page'}
          </h1>
          {/* Placeholder for potential actions like download */}
          <div></div>
        </div>

        {/* Image Display Area - Outer container is now relative */}
        <div 
          className="relative p-4 flex justify-center items-center bg-gray-50" 
          style={{ minHeight: 'calc(100vh - 200px)' }} // Keep minHeight, it acts as the size constraint
        >
           {/* Removed the intermediate div, Image is now direct child */}
           <Image
              src={coloring.url}
              alt={coloring.address || 'Coloring page'}
              fill
              sizes="(max-width: 1024px) 90vw, 800px"
              className="object-contain" // object-contain will make it fit within the container
              priority
           />
        </div>

        {/* Optional Footer Area */}
         {/* <div className="p-4 border-t border-gray-200 text-center">
             <p className="text-sm text-gray-500">Image generated on ...</p>
         </div> */}
      </div>
    </div>
  );
} 