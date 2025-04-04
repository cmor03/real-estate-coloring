'use client';

import { useState, useEffect } from 'react';
import { auth } from '../../lib/firebase';
import { db, ensureUserDocument } from '../../app/firebase/config';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';

interface Coloring {
  id: string;
  url: string;
  address: string;
  createdAt: Date;
}

const ITEMS_PER_PAGE = 9;

// Stripe price IDs
const STRIPE_PRICE_IDS = {
  TWENTY_CREDITS: 'price_20credits', // $10 for 20 credits
};

export default function DashboardPage() {
  const [credits, setCredits] = useState(0);
  const [colorings, setColorings] = useState<Coloring[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Check for success or canceled payment
    const success = searchParams?.get('success');
    const canceled = searchParams?.get('canceled');
    
    if (success) {
      toast.success('Payment successful! Your credits have been added.');
      // Refresh user data to show updated credits
      if (auth.currentUser) {
        fetchUserData(auth.currentUser.uid);
      }
    } else if (canceled) {
      toast.error('Payment canceled.');
    }
    
    // Check online status
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setError(null);
        if (user) {
          await fetchUserData(user.uid);
          await fetchColorings(user.uid);
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error in dashboard initialization:', error);
        setError(error instanceof Error ? error.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [router, searchParams]);

  const fetchUserData = async (userId: string) => {
    try {
      console.log('Fetching user data for:', userId);
      
      // Ensure user document exists
      await ensureUserDocument(userId);
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        setCredits(userDoc.data().credits || 0);
        console.log('User data fetched successfully');
      } else {
        console.error('User document does not exist');
        router.push('/login');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  };

  const fetchColorings = async (userId: string, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      }
      setError(null);

      console.log('Fetching colorings for user:', userId, 'isLoadMore:', isLoadMore);
      console.log('Network status:', navigator.onLine ? 'online' : 'offline');

      // Create a query that doesn't require a composite index
      let coloringsQuery = query(
        collection(db, 'colorings'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(ITEMS_PER_PAGE)
      );

      if (isLoadMore && lastDoc) {
        coloringsQuery = query(
          collection(db, 'colorings'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          startAfter(lastDoc),
          limit(ITEMS_PER_PAGE)
        );
      }

      console.log('Executing Firestore query...');
      const querySnapshot = await getDocs(coloringsQuery);
      console.log('Query completed, documents:', querySnapshot.size);

      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(lastVisible);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);

      const coloringsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Coloring[];

      if (isLoadMore) {
        setColorings(prev => [...prev, ...coloringsData]);
      } else {
        setColorings(coloringsData);
      }
      console.log('Colorings updated successfully');
    } catch (error) {
      console.error('Error fetching colorings:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      setError(error instanceof Error ? error.message : 'Failed to fetch colorings');
      throw error;
    } finally {
      if (isLoadMore) {
        setLoadingMore(false);
      }
    }
  };

  const loadMore = async () => {
    const user = auth.currentUser;
    if (user && hasMore && !loadingMore) {
      await fetchColorings(user.uid, true);
    }
  };

  const handleBuyCredits = async (priceId: string) => {
    if (!auth.currentUser) {
      toast.error('You must be logged in to buy credits');
      return;
    }

    try {
      setIsProcessingPayment(true);
      
      // Get the current user's ID token
      const idToken = await auth.currentUser.getIdToken();
      
      // Create a checkout session
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ priceId }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }
      
      const { url } = await response.json();
      
      // Redirect to Stripe Checkout
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to process payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      setError(error instanceof Error ? error.message : 'Failed to sign out');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Your Coloring Pages</h1>
          <div className="flex items-center space-x-4">
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-md font-medium">
              Credits: {credits}
            </div>
            <button
              onClick={() => handleBuyCredits(STRIPE_PRICE_IDS.TWENTY_CREDITS)}
              disabled={isProcessingPayment}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingPayment ? 'Processing...' : 'Buy 20 Credits ($10)'}
            </button>
            <button
              onClick={handleLogout}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-medium"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        )}

        {isOffline && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Offline Mode</strong>
            <span className="block sm:inline"> You are currently offline. Some features may be limited.</span>
          </div>
        )}

        {colorings.length === 0 ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">No coloring pages yet</h2>
            <p className="text-gray-500 mb-6">Upload a real estate image to create your first coloring page!</p>
            <Link href="/generate" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-medium">
              Create Your First Coloring Page
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {colorings.map((coloring) => (
                <div key={coloring.id} className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-4">
                    <h3 className="text-lg font-medium text-gray-900 truncate">{coloring.address}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Created on {new Date(coloring.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 px-4 py-4 sm:px-6">
                    <div className="flex justify-between">
                      <a
                        href={coloring.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        View Coloring Page
                      </a>
                      <a
                        href={coloring.url}
                        download
                        className="text-green-600 hover:text-green-800 font-medium"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
} 