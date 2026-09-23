import { signIn } from '@/auth';

// TODO: swap the raw button for P3's <Button> once src/components/ui lands.
export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-4 bg-[#665FB3]">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, no next/image optimizer configured (design/design.md) */}
        <img src="/logo.png" alt="" className="mx-auto mb-4 h-20 w-20 object-contain" />
        <h1 className="text-2xl font-bold mb-2">המעברה</h1>
        <p className="text-gray-600 mb-8">מערכת ניהול פינוי, הובלה וקליטת ציוד</p>
        <form
          action={async () => {
            'use server';
            await signIn('google', { redirectTo: '/' });
          }}
        >
          <button className="w-full rounded-full bg-[#5F42FF] py-4 text-lg font-bold text-white">
            התחברות עם Google
          </button>
        </form>
      </div>
    </main>
  );
}
