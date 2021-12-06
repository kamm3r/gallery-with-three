import '../styles/globals.css';
import { AppProps } from 'next/app';
import { useWindowSize } from '../hooks/useWindowSize';
import { SmScreenErr } from '../components/smScreenErr';

function MyApp({ Component, pageProps }: AppProps) {
  const size: any = useWindowSize();
  if (size.width <= 1024) return <SmScreenErr />;

  return <Component width={size.width} {...pageProps} />;
}
export default MyApp;
