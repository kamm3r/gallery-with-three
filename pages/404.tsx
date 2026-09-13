import Link from 'next/link';

export default function Custom404() {
  return (
    <main className='error-page'>
      <div>
        <p>Lost trail</p>
        <h1>This path leaves the forest.</h1>
        <Link href='/'>Go home</Link>
      </div>
    </main>
  );
}
