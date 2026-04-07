import { SiGithub } from '@icons-pack/react-simple-icons';
import React from 'react';
import { Link } from 'react-router-dom';

const Header = (): React.JSX.Element => {
    return (
        <header className="border-b border-border/70 bg-background">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
                <Link
                    className="text-2xl font-semibold tracking-tight text-foreground no-underline sm:text-[2rem]"
                    to="/"
                >
                    sealed.vote
                </Link>
                <a
                    aria-label="GitHub profile"
                    className="inline-flex size-10 items-center justify-center rounded-full border border-border/70 bg-card text-foreground transition-colors hover:bg-accent"
                    href="https://github.com/Tenemo"
                    rel="noreferrer"
                    target="_blank"
                >
                    <SiGithub className="size-[18px]" />
                </a>
            </div>
        </header>
    );
};

export default Header;
