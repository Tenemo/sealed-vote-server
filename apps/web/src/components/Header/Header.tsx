import { SiGithub } from '@icons-pack/react-simple-icons';
import React from 'react';

const Header = (): React.JSX.Element => {
  return (
    <header className="flex w-full items-center justify-between border-b border-foreground p-2">
      <a
        className="text-2xl leading-none text-foreground no-underline"
        href="/"
      >
        sealed.vote
      </a>
      <a
        aria-label="GitHub profile"
        className="cursor-pointer pt-1.5 text-foreground"
        href="https://github.com/Tenemo"
      >
        <SiGithub className="size-5" />
      </a>
    </header>
  );
};

export default Header;
