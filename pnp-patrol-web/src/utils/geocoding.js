/**
 * Geocoding Utility
 * Converts coordinates to human-readable addresses using OpenStreetMap Nominatim
 */

import React from 'react';

// Cache for geocoding results to avoid duplicate API calls
const geocodingCache = new Map();

// Track pending requests to avoid duplicates
const pendingRequests = new Map();

/**
 * Reverse geocode coordinates to get a human-readable address
 * Uses OpenStreetMap Nominatim API (free, no API key required)
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<Object|null>} Address object or null
 */
export async function reverseGeocode(latitude, longitude) {
  const cacheKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

  // Check cache first
  if (geocodingCache.has(cacheKey)) {
    return geocodingCache.get(cacheKey);
  }

  // Check if there's already a pending request for these coordinates
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const requestPromise = fetchReverseGeocode(latitude, longitude, cacheKey);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}

async function fetchReverseGeocode(latitude, longitude, cacheKey) {
  try {
    // OpenStreetMap Nominatim API
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RONDA-Patrol-Web/1.0',
      },
    });

    if (!response.ok) {
      console.error('Geocoding API error:', response.statusText);
      return null;
    }

    const data = await response.json();

    if (!data || data.error) {
      console.error('Geocoding error:', data?.error || 'No results');
      return null;
    }

    const address = {
      display_name: simplifyAddress(data.display_name),
      street: data.address?.road || data.address?.street,
      city: data.address?.city || data.address?.town || data.address?.village || data.address?.municipality,
      state: data.address?.state,
      country: data.address?.country,
      suburb: data.address?.suburb,
      neighbourhood: data.address?.neighbourhood,
    };

    // Cache the result
    geocodingCache.set(cacheKey, address);

    return address;
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return null;
  }
}

/**
 * Simplify a full address string to a more readable format
 * Removes redundant country name at the end if present
 */
function simplifyAddress(displayName) {
  if (!displayName) return 'Unknown location';

  // Remove country at the end (usually the last comma-separated part)
  const parts = displayName.split(',').map(p => p.trim());

  // If the last part is a country code or "Philippines", remove it
  const lastPart = parts[parts.length - 1]?.toLowerCase();
  if (lastPart === 'philippines' || lastPart === 'ph') {
    parts.pop();
  }

  // Limit to first 3-4 parts for a cleaner display
  const simplified = parts.slice(0, 4).join(', ');

  return simplified || displayName;
}

/**
 * Format address for display based on available components
 * Returns a short, user-friendly location name
 */
export function formatLocationName(address) {
  if (!address) return 'Getting location...';

  // Build a concise location name
  const parts = [];

  if (address.neighbourhood) {
    parts.push(address.neighbourhood);
  } else if (address.suburb) {
    parts.push(address.suburb);
  } else if (address.street) {
    parts.push(address.street);
  }

  if (address.city && !parts.includes(address.city)) {
    parts.push(address.city);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  // Fallback to display name or a generic message
  return address.display_name || 'Unknown location';
}

/**
 * Get a short location name (just neighbourhood/suburb + city)
 */
export function getShortLocationName(address) {
  if (!address) return 'Locating...';

  const parts = [];

  if (address.neighbourhood || address.suburb) {
    parts.push(address.neighbourhood || address.suburb);
  }

  if (address.city) {
    parts.push(address.city);
  } else if (address.state) {
    parts.push(address.state);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return address.display_name || 'Locating...';
}

/**
 * React hook for reverse geocoding with auto-update
 * Usage: const locationName = useLocationName(lat, lon);
 */
export function useLocationName(latitude, longitude) {
  const [locationName, setLocationName] = React.useState('Locating...');

  React.useEffect(() => {
    if (!latitude || !longitude) {
      setLocationName('No location');
      return;
    }

    let cancelled = false;

    const fetchLocation = async () => {
      const address = await reverseGeocode(latitude, longitude);
      if (!cancelled) {
        setLocationName(getShortLocationName(address));
      }
    };

    fetchLocation();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  return locationName;
}

/**
 * Clear the geocoding cache (useful for testing or memory management)
 */
export function clearGeocodingCache() {
  geocodingCache.clear();
}

/**
 * Get cache size for debugging
 */
export function getGeocodingCacheSize() {
  return geocodingCache.size;
}
