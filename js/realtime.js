// realtime.js — Live subscriptions for order status + notifications

let ordersChannel = null;
let notificationsChannel = null;

function subscribeToOrders(userId, onChanges) {
  const supabase = getSupabase();

  if (ordersChannel) {
    supabase.removeChannel(ordersChannel);
  }

  ordersChannel = supabase
    .channel(`orders:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onChanges(payload);
      }
    )
    .subscribe();
}

function subscribeToNotifications(userId, onChanges) {
  const supabase = getSupabase();

  if (notificationsChannel) {
    supabase.removeChannel(notificationsChannel);
  }

  notificationsChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onChanges(payload);
      }
    )
    .subscribe();
}

function unsubscribeAll() {
  const supabase = getSupabase();
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel);
    ordersChannel = null;
  }
  if (notificationsChannel) {
    supabase.removeChannel(notificationsChannel);
    notificationsChannel = null;
  }
}
