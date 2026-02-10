import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gray-900 text-xl font-bold text-white">
            V
          </div>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            VeriVote Kenya
          </h1>
          <p className="mt-2 text-base text-gray-500">
            Secure Electronic Voting System
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/vote"
            className="group flex flex-col items-center rounded-xl border-2 border-green-200 bg-white p-8 text-center shadow-sm transition-colors hover:border-green-700 hover:bg-green-50"
          >
            <svg
              className="h-10 w-10 text-green-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="mt-3 text-lg font-semibold text-gray-900">
              Vote
            </span>
            <span className="mt-1 text-sm text-gray-500">
              Cast your ballot securely
            </span>
          </Link>

          <Link
            href="/admin"
            className="group flex flex-col items-center rounded-xl border-2 border-blue-200 bg-white p-8 text-center shadow-sm transition-colors hover:border-blue-700 hover:bg-blue-50"
          >
            <svg
              className="h-10 w-10 text-blue-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
              />
            </svg>
            <span className="mt-3 text-lg font-semibold text-gray-900">
              Admin
            </span>
            <span className="mt-1 text-sm text-gray-500">
              Election administration
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
