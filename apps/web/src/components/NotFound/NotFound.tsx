import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';

const NotFound = (): React.JSX.Element => {
    const navigate = useNavigate();
    const onClick = (): void => {
        void navigate('/');
    };

    return (
        <div className="flex min-h-[50vh] items-center justify-center">
            <Panel className="max-w-xl text-center">
                <div className="space-y-4">
                    <h1 className="text-3xl font-semibold tracking-tight">
                        Page not found
                    </h1>
                    <p className="text-sm leading-7 text-secondary sm:text-base">
                        Path <strong>{window.location.pathname}</strong> not
                        found.
                    </p>
                    <div className="flex justify-center">
                        <Button onClick={onClick} variant="outline">
                            Go back to vote creation
                        </Button>
                    </div>
                </div>
            </Panel>
        </div>
    );
};

export default NotFound;
