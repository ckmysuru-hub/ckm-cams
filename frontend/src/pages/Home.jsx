import { Link } from "react-router-dom";
import { Logo } from "@/components/Brand";
import { LogIn } from "lucide-react";

export default function Home() {
  return (
    <div className=" inset-5 bg-white overflow-hidden" data-testid="home-page">
      <header className="absolute top-0 inset-x-0 z-10 h-05 px-6 sm:px-2 border-b border-[var(--ck-line)] flex items-center justify-between gap-4">
        <Logo />
        <Link
          to="/login"
          className="ck-btn-primary inline-flex items-center gap-2"
          data-testid="home-login-btn">
          <LogIn size={8} />
          Login
        </Link>
      </header>
            <iframe
        title="Chess Klub Mysuru"
        src="https://mysuru.chessklub.com/"
        className="absolute inset-0 w-screen h-screen border-0 block"
        data-testid="home-embed"
      />
    </div>
  );
}
