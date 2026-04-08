import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

const NotFound = (): React.JSX.Element => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const onClick = (): void => {
        void navigate('/');
    };

    return (
        <div className="flex min-h-[50vh] items-center justify-center">
            <Panel className="w-full max-w-xl space-y-4 text-center">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Page not found
                </h1>
                <div className="space-y-2">
                    <p className="text-sm leading-7 text-muted-foreground sm:text-base">
                        The requested path does not exist.
                    </p>
                    <p className="break-all rounded-xl bg-accent px-4 py-3 text-sm font-medium text-foreground">
                        {pathname}
                    </p>
                </div>
                <div className="flex justify-center">
                    <Button
                        className="w-full sm:w-auto"
                        onClick={onClick}
                        variant="outline"
                    >
                        Go back to vote creation
                    </Button>
                </div>
            </Panel>
        </div>
    );
};

export default NotFound;
