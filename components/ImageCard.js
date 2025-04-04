import Image from 'next/image';
import { useState } from 'react';

export default function ImageCard({ image, onDelete }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this image?')) {
      setIsLoading(true);
      try {
        await onDelete(image.id);
      } catch (error) {
        console.error('Error deleting image:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative h-48 w-full">
        <Image
          src={image.url}
          alt={image.address || 'Colored property'}
          layout="fill"
          objectFit="cover"
          className="transition-transform duration-300 hover:scale-105"
        />
      </div>
      <div className="p-4">
        <h3 className="text-lg font-medium text-gray-900 truncate">
          {image.address || 'Property'}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Created: {formatDate(image.createdAt)}
        </p>
        <div className="mt-4 flex justify-between items-center">
          <a
            href={image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary-600 hover:text-primary-800"
          >
            View Full Size
          </a>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
} 