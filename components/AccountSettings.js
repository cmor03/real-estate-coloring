import { useState } from 'react';
import { auth } from '../lib/firebase';

export default function AccountSettings({ user, credits }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleUpgrade = async (plan) => {
    setIsLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // Get the current user's ID token
      const token = await auth.currentUser.getIdToken();
      
      // Call the payment API
      const response = await fetch('/api/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          token,
          plan
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process payment');
      }
      
      const data = await response.json();
      
      // Redirect to Stripe Checkout
      window.location.href = data.url;
      
    } catch (error) {
      console.error('Error upgrading account:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Failed to upgrade account. Please try again.' 
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Settings</h2>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-700">Available Credits:</span>
          <span className="font-medium text-primary-600">{credits}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-primary-600 h-2.5 rounded-full" 
            style={{ width: `${Math.min(100, (credits / 20) * 100)}%` }}
          ></div>
        </div>
      </div>
      
      {message.text && (
        <div className={`mb-4 p-3 rounded-md ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.text}
        </div>
      )}
      
      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-medium text-gray-900">Basic Plan</h3>
          <p className="text-sm text-gray-500 mb-2">5 credits - $9.99/month</p>
          <button
            onClick={() => handleUpgrade('basic')}
            disabled={isLoading}
            className="btn-primary w-full"
          >
            {isLoading ? 'Processing...' : 'Upgrade to Basic'}
          </button>
        </div>
        
        <div className="border rounded-lg p-4 bg-primary-50">
          <h3 className="font-medium text-gray-900">Premium Plan</h3>
          <p className="text-sm text-gray-500 mb-2">20 credits - $29.99/month</p>
          <button
            onClick={() => handleUpgrade('premium')}
            disabled={isLoading}
            className="btn-primary w-full"
          >
            {isLoading ? 'Processing...' : 'Upgrade to Premium'}
          </button>
        </div>
      </div>
    </div>
  );
} 