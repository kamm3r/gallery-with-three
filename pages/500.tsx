import Link from 'next/link';

export default function Custom500() {
  return (
    <main className='error-page'>
      <div>
        <p>Scene interrupted</p>
        <h1>The world could not load.</h1>
        <Link href='/'>Reload the forest</Link>
      </div>
    </main>
  );
}
