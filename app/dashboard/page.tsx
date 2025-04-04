'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { db, auth, ensureUserDocument } from '@/app/firebase/config';
import { collection, query, where, getDocs, doc, getDoc, orderBy, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { onAuthStateChanged, signOut } from 'firebase/auth';

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

// Renamed original component to DashboardContent
function DashboardContent() {
  const [credits, setCredits] = useState(0);
  const [colorings, setColorings] = useState<Coloring[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Define fetch functions with useCallback before useEffect
  const fetchUserData = useCallback(async (userId: string) => {
    try {
      console.log('Fetching user data for:', userId);
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
      // Rethrow or set error state as needed
      setError('Failed to load user data.'); 
    }
  }, [router]); // Dependencies for fetchUserData

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchColorings = useCallback(async (userId: string, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        // Reset error only when fetching initial batch
        setError(null);
      }

      console.log('Fetching colorings for user:', userId, 'isLoadMore:', isLoadMore);
      
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

      const querySnapshot = await getDocs(coloringsQuery);
      const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
      setLastDoc(lastVisible);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);

      const coloringsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Coloring[];

      setColorings(prev => isLoadMore ? [...prev, ...coloringsData] : coloringsData);
      console.log('Colorings updated successfully');
    } catch (error) {
      console.error('Error fetching colorings:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch colorings');
    } finally {
      if (isLoadMore) {
        setLoadingMore(false);
      }
    }
  }, []); // Keep dependency array as is, added disable comment above

  useEffect(() => {
    const success = searchParams?.get('success');
    const canceled = searchParams?.get('canceled');
    
    if (success) {
      toast.success('Payment successful! Your credits have been added.');
      if (auth.currentUser) {
        fetchUserData(auth.currentUser.uid);
      }
      // Clear query params to prevent message on refresh
      router.replace('/dashboard', { scroll: false });
    } else if (canceled) {
      toast.error('Payment canceled.');
      // Clear query params
      router.replace('/dashboard', { scroll: false });
    }
    
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true); // Set loading true when auth state changes
      try {
        if (user) {
          // Fetch data using the memoized functions
          await fetchUserData(user.uid);
          await fetchColorings(user.uid, false); // Fetch initial batch
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Error in auth state change handler:', error);
        setError(error instanceof Error ? error.message : 'An authentication error occurred');
      } finally {
        setLoading(false); // Set loading false after operations complete
      }
    });

    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setIsMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // Now useEffect depends on the stable useCallback references
    // Added fetchUserData and fetchColorings to the dependency array below
  }, [router, searchParams, fetchUserData, fetchColorings]);

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
      setIsMenuOpen(false);
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
      <header className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="bg-blue-100 text-blue-800 px-3 py-2 rounded-md font-medium text-sm sm:text-base">
              Credits: {credits}
            </div>
            <button
              onClick={() => handleBuyCredits(STRIPE_PRICE_IDS.TWENTY_CREDITS)}
              disabled={isProcessingPayment}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingPayment ? 'Processing...' : 'Buy Credits'}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                aria-label="User menu"
                aria-haspopup="true"
              >
                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {isMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20">
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
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
            <p className="text-gray-500 mb-6">Click the &apos;+&apos; button to create your first coloring page!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {colorings.map((coloring) => (
                <div key={coloring.id} className="bg-white overflow-hidden shadow rounded-lg flex flex-col">
                  <div className="p-4 flex-grow">
                    <h3 className="text-lg font-medium text-gray-900 truncate" title={coloring.address}>{coloring.address || 'Untitled Coloring'}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Created on {new Date(coloring.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 px-4 py-3 sm:px-6 border-t border-gray-200">
                    <div className="flex justify-between items-center text-sm">
                      <Link
                        href={`/coloring/${coloring.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                      <a
                        href={coloring.url}
                        download={`coloring-${coloring.address || coloring.id}.png`}
                        className="font-medium text-green-600 hover:text-green-800"
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

      <Link
        href="/generate"
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg flex items-center justify-center z-20"
        aria-label="Create new coloring page"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
        </svg>
      </Link>
    </div>
  );
}

// New default export component that wraps DashboardContent in Suspense
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoadingFallback />}>
      <DashboardContent />
    </Suspense>
  );
}

// Simple loading fallback component
function DashboardLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );
} 