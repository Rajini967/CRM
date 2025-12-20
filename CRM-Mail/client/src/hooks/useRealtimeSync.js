import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from 'react-query';
import axios from 'axios';
import toast from 'react-hot-toast';

export const useRealtimeSync = (interval = 30000) => {
  const queryClient = useQueryClient();
  const intervalRef = useRef(null);
  const isActiveRef = useRef(true);

  const syncEmails = useCallback(async () => {
    try {
      const response = await axios.post('/api/emails/sync');
      if (response.data.success && response.data.processed > 0) {
        // Invalidate and refetch email queries
        queryClient.invalidateQueries('emails');
        queryClient.invalidateQueries('email-logs');
        queryClient.invalidateQueries('imap-status');
        
        // Show subtle notification for new emails
        if (response.data.processed > 0) {
          toast.success(`${response.data.processed} new emails synced`, {
            duration: 2000,
            position: 'bottom-right'
          });
        }
      }
    } catch (error) {
      console.error('Sync error:', error);
      // Don't show error toast for sync failures to avoid spam
    }
  }, [queryClient]);

  const startSync = useCallback(() => {
    if (intervalRef.current) return;
    
    isActiveRef.current = true;
    intervalRef.current = setInterval(syncEmails, interval);
    
    // Initial sync
    syncEmails();
  }, [syncEmails, interval]);

  const stopSync = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isActiveRef.current = false;
  }, []);

  const manualSync = useCallback(async () => {
    if (!isActiveRef.current) return;
    await syncEmails();
  }, [syncEmails]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isActiveRef.current = false;
    };
  }, []); // Empty deps - only cleanup on unmount

  return {
    startSync,
    stopSync,
    manualSync,
    isActive: isActiveRef.current
  };
};

export default useRealtimeSync;
