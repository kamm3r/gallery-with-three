import { Link } from "react-router-dom";

export default function Custom404() {
  return (
    <main className="error-page">
      <div>
        <p>Lost trail</p>
        <h1>This path leaves the forest.</h1>
        <Link to="/">Go home</Link>
      </div>
    </main>
  );
}
