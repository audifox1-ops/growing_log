import type {Metadata} from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: '추억의 보물 상자 (Personal Edition)',
  description: '로그인 없이 바로 시작하는 우리 아이 성장 영상 제작소',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ko" className={`${inter.variable} ${cormorant.variable}`}>
      <body suppressHydrationWarning>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
