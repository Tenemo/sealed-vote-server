import React from 'react';
import { Link } from 'react-router-dom';

const GitHubIcon = ({
    className,
}: {
    className?: string;
}): React.JSX.Element => (
    <svg
        aria-hidden="true"
        className={className}
        fill="currentColor"
        viewBox="0 0 24 24"
    >
        <path d="M12 .297a12 12 0 0 0-3.79 23.39c.6.111.82-.26.82-.577v-2.234c-3.338.726-4.042-1.61-4.042-1.61a3.183 3.183 0 0 0-1.336-1.756c-1.092-.746.083-.731.083-.731a2.52 2.52 0 0 1 1.84 1.235 2.548 2.548 0 0 0 3.478.995 2.55 2.55 0 0 1 .76-1.598c-2.665-.303-5.466-1.332-5.466-5.93a4.64 4.64 0 0 1 1.235-3.22 4.3 4.3 0 0 1 .117-3.176s1.008-.322 3.3 1.23a11.47 11.47 0 0 1 6.006 0c2.29-1.552 3.297-1.23 3.297-1.23a4.297 4.297 0 0 1 .12 3.176 4.63 4.63 0 0 1 1.233 3.22c0 4.609-2.806 5.624-5.479 5.921a2.869 2.869 0 0 1 .814 2.228v3.301c0 .319.216.694.825.576A12.004 12.004 0 0 0 12 .297" />
    </svg>
);

const Header = (): React.JSX.Element => {
    return (
        <header className="relative border-b border-border/70 bg-background">
            <div className="mx-auto flex w-full max-w-[96rem] items-center px-4 py-4 pr-14 sm:px-6 sm:pr-16">
                <Link
                    className="rounded-sm text-2xl font-semibold text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-foreground/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[2rem]"
                    to="/"
                >
                    sealed.vote
                </Link>
            </div>
            <a
                aria-label="Open the sealed.vote repository on GitHub"
                className="absolute right-4 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:right-6"
                href="https://github.com/Tenemo/sealed-vote"
                rel="noopener noreferrer"
                target="_blank"
            >
                <GitHubIcon className="size-[18px]" />
            </a>
        </header>
    );
};

export default Header;
