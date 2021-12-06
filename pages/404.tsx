import Link from 'next/link';

export default function Custom404() {
  return (
    <section className='flex justify-center items-center h-screen'>
      <div className='flex flex-col justify-center items-start'>
        <h1 className='text-5xl font-bold mb-3'>Something went wrong</h1>
        <Link href='/'>
          <a className='text-3xl '>Go Home</a>
        </Link>
      </div>
    </section>
  );
}
