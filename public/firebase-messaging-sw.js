/* Firebase Messaging worker for installed Home Screen web app. */
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js');
importScripts('/__/firebase/init.js');
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
 const data=payload.data||{};
 if(!data.title)return;
 self.registration.showNotification(data.title,{
  body:data.body||'Your climbing alert is ready.',
  icon:'/logo.png',badge:'/logo.png',tag:'knot-capacity-alert',renotify:false,
  data:{url:data.url||'/planner.html'}
 });
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const url=new URL(event.notification.data?.url||'/planner.html',self.location.origin);
 if(url.origin!==self.location.origin)return;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  for(const client of windows){if(client.url===url.href&&'focus' in client)return client.focus();}
  return clients.openWindow(url.href);
 }));
});
