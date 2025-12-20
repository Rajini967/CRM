import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

const useRealtimeEmail = (userId) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newEmailsCount, setNewEmailsCount] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    // Create socket connection - connect to backend API port
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const newSocket = io(apiUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000
    });

    let isMounted = true;

    // Connection event handlers
    newSocket.on('connect', () => {
      if (!isMounted) return;
      console.log('🔌 Connected to real-time email server');
      setIsConnected(true);
      
      // Join user-specific room
      newSocket.emit('joinEmailRoom', userId);
    });

    newSocket.on('disconnect', (reason) => {
      if (!isMounted) return;
      console.log('🔌 Disconnected from real-time email server:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      if (!isMounted) return;
      // Only log if it's not a normal disconnection
      if (error.message && !error.message.includes('xhr poll error')) {
        console.error('❌ Socket connection error:', error);
      }
      setIsConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      if (!isMounted) return;
      console.log(`🔌 Reconnected to real-time email server after ${attemptNumber} attempts`);
      setIsConnected(true);
      newSocket.emit('joinEmailRoom', userId);
    });

    newSocket.on('reconnect_attempt', () => {
      if (!isMounted) return;
      console.log('🔄 Attempting to reconnect to real-time email server...');
    });

    newSocket.on('reconnect_failed', () => {
      if (!isMounted) return;
      console.warn('⚠️ Failed to reconnect to real-time email server');
      setIsConnected(false);
    });

    // Real-time email events
    newSocket.on('newEmails', (data) => {
      console.log('📧 New emails received:', data);
      
      // Update email count
      setNewEmailsCount(prev => prev + data.count);
      
      // Show notification
      toast.success(`📧 ${data.count} new email(s) from ${data.accountName}`, {
        duration: 5000,
        position: 'top-right'
      });
      
      // Invalidate and refetch emails query
      queryClient.invalidateQueries('emails');
      
      // Optional: Show detailed notification for each email
      data.emails.forEach(email => {
        console.log(`📧 New email: ${email.subject} from ${email.from}`);
      });
    });

    // Email sync status events
    newSocket.on('syncStatus', (status) => {
      console.log('🔄 Email sync status:', status);
    });

    // Error handling
    newSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      toast.error('Real-time email sync error');
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      isMounted = false;
      if (newSocket) {
        // Remove all listeners to prevent memory leaks
        newSocket.removeAllListeners();
        // Disconnect gracefully
        if (newSocket.connected) {
          newSocket.disconnect();
        }
      }
    };
  }, [userId, queryClient]);

  // Manual sync trigger
  const triggerSync = async () => {
    try {
      toast.loading('🔄 Syncing emails...', { id: 'email-sync' });
      
      const response = await fetch('/api/emails/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ daysBack: 365 }) // Sync 1 year of emails
      });
      
      const data = await response.json();
      
      if (response.ok) {
        toast.success(`✅ Synced ${data.totalSynced} emails from ${data.accountsProcessed} account(s)`, {
          id: 'email-sync',
          duration: 5000
        });
        // Invalidate emails query to refresh the list
        queryClient.invalidateQueries('emails');
      } else {
        toast.error(data.error || 'Failed to trigger email sync', { id: 'email-sync' });
      }
    } catch (error) {
      console.error('Error triggering sync:', error);
      toast.error('Failed to trigger email sync', { id: 'email-sync' });
    }
  };

  // Get sync status
  const getSyncStatus = async () => {
    try {
      const response = await fetch('/api/realtime/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.status;
      }
    } catch (error) {
      console.error('Error getting sync status:', error);
    }
    return null;
  };

  // Stop sync
  const stopSync = async () => {
    try {
      const response = await fetch('/api/realtime/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        toast.success('🛑 Email sync stopped');
      } else {
        toast.error('Failed to stop email sync');
      }
    } catch (error) {
      console.error('Error stopping sync:', error);
      toast.error('Failed to stop email sync');
    }
  };

  return {
    socket,
    isConnected,
    newEmailsCount,
    triggerSync,
    getSyncStatus,
    stopSync,
    clearNewEmailsCount: () => setNewEmailsCount(0)
  };
};

export default useRealtimeEmail;
