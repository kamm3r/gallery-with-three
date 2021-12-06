export default function Custom500() {
  return (
    <section className='flex justify-center items-center h-screen'>
      <div className='flex flex-col justify-center items-start'>
        <h1 className='text-5xl font-bold mb-3'>Something went very wrong</h1>
        <p className='text-3xl '>
          Refresh the page or come back later when it’s fixed.
        </p>
      </div>
    </section>
  );
}
