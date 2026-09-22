import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    /** Our users.id (named to avoid clashing with Auth.js AdapterSession.userId: string). */
    appUserId?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number;
  }
}
