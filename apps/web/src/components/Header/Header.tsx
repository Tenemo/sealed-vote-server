import { SiGithub } from '@icons-pack/react-simple-icons';
import React from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

const Header = (): React.JSX.Element => {
    return (
        <header className="border-b border-border/70 bg-background">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
                <Link
                    className="rounded-sm text-2xl font-semibold tracking-tight text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-foreground/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-3xl"
                    to="/"
                >
                    sealed.vote
                </Link>
                <Button asChild size="icon-lg" variant="secondary">
                    <a
                        aria-label="View the project source on GitHub"
                        href="https://github.com/Tenemo"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        <SiGithub aria-hidden="true" className="size-4" />
                    </a>
                </Button>
            </div>
        </header>
    );
};

export default Header;
