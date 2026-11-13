import { useCallback } from 'react';
import { useDispatch } from 'react-redux';

import { useSocketEvent } from '../../lib/socket';
import { SOCKET_EVENTS } from '../../lib/socketEvents';
import { pushToast } from '../ui/uiSlice';

export default function AutomationNotifyListener() {
  const dispatch = useDispatch();

  const onAutomationNotify = useCallback((payload) => {
    const message = payload?.message;
    if (!message) return;
    dispatch(pushToast({ type: 'info', message }));
  }, [dispatch]);

  useSocketEvent(SOCKET_EVENTS.AUTOMATION_NOTIFY, onAutomationNotify);
  return null;
}
