import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth, firestore, storage } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import Navbar from '../components/Navbar';
import ImageCard from '../components/ImageCard';
import AccountSettings from '../components/AccountSettings';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [colorings, setColorings] = useState([]);
  const [credits, setCredits] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        await fetchUserData(user.uid);
        await fetchColorings(user.uid);
      } else {
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const fetchUserData = async (userId) => {
    try {
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      
      if (userDoc.exists()) {
        setCredits(userDoc.data().credits || 0);
      } else {
        // Create user document if it doesn't exist
        await setDoc(doc(firestore, 'users', userId), {
          credits: 5, // Default free credits
          createdAt: new Date(),
          updatedAt: new Date()
        });
        setCredits(5);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  const fetchColorings = async (userId) => {
    try {
      const coloringsQuery = query(
        collection(firestore, 'colorings'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(coloringsQuery);
      const coloringsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setColorings(coloringsData);
    } catch (error) {
      console.error('Error fetching colorings:', error);
    }
  };

  const handleDeleteColoring = async (coloringId) => {
    try {
      // Find the coloring to get the image URL
      const coloring = colorings.find(c => c.id === coloringId);
      
      if (coloring && coloring.url) {
        // Delete the image from storage
        const imageRef = ref(storage, coloring.url);
        await deleteObject(imageRef);
      }
      
      // Delete the document from Firestore
      await deleteDoc(doc(firestore, 'colorings', coloringId));
      
      // Update the state
      setColorings(colorings.filter(c => c.id !== coloringId));
    } catch (error) {
      console.error('Error deleting coloring:', error);
    }
  };

  const handleGenerateNew = async () => {
    if (credits <= 0) {
      setError('You need more credits to generate a new coloring. Please upgrade your plan.');
      return;
    }
    
    setGenerating(true);
    setError('');
    
    try {
      // Call your API route to generate a new coloring
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          address: '123 Main St, Anytown, USA', // This would come from a form in a real app
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate coloring');
      }
      
      const data = await response.json();
      
      // Update credits
      const newCredits = credits - 1;
      setCredits(newCredits);
      
      // Update user document
      await setDoc(doc(firestore, 'users', user.uid), {
        credits: newCredits,
        updatedAt: new Date()
      }, { merge: true });
      
      // Add the new coloring to the list
      setColorings([{
        id: data.id,
        url: data.url,
        address: data.address,
        createdAt: new Date(),
        userId: user.uid
      }, ...colorings]);
      
    } catch (error) {
      console.error('Error generating coloring:', error);
      setError('Failed to generate coloring. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreditsUpdate = (newCredits) => {
    setCredits(newCredits);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Main content */}
            <div className="flex-1">
              <div className="bg-white shadow rounded-lg p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Your Colorings</h2>
                  <button
                    onClick={handleGenerateNew}
                    disabled={generating || credits <= 0}
                    className="btn-primary"
                  >
                    {generating ? 'Generating...' : 'Generate New'}
                  </button>
                </div>
                
                {error && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                    <span className="block sm:inline">{error}</span>
                  </div>
                )}
                
                {colorings.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">You haven&apos;t created any colorings yet.</p>
                    <p className="text-gray-500 mt-2">Click &quot;Generate New&quot; to create your first coloring!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {colorings.map((coloring) => (
                      <ImageCard 
                        key={coloring.id} 
                        image={coloring} 
                        onDelete={handleDeleteColoring} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Sidebar */}
            <div className="w-full md:w-80">
              <AccountSettings 
                user={user} 
                credits={credits} 
                onCreditsUpdate={handleCreditsUpdate} 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 