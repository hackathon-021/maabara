import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { ensureUser } from '@/lib/users';

// JWT sessions: the token only carries our users.id. Role is read fresh from the DB on every
// request, so switching roles takes effect immediately without re-login.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async jwt({ token }) {
      if (token.email && token.userId === undefined) {
        const user = await ensureUser(token.email, token.name ?? token.email);
        token.userId = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.appUserId = token.userId;
      return session;
    },
  },
});
