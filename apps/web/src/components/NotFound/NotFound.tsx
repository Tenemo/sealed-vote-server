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
        <div className="flex min-h-[50vh] flex-1 items-center justify-center">
            <Panel className="w-full max-w-xl text-center">
                <div className="space-y-4">
                    <h1 className="page-title">Page not found</h1>
                    <div className="space-y-2">
                        <p className="field-note">
                            The requested path does not exist.
                        </p>
                        <p className="field-note">
                            Path{' '}
                            <strong className="break-all">{pathname}</strong>{' '}
                            not found.
                        </p>
                    </div>
                    <div className="flex justify-center">
                        <Button
                            className="w-full sm:w-auto"
                            onClick={onClick}
                            variant="outline"
                        >
                            Go back to poll creation
                        </Button>
                    </div>
                </div>
            </Panel>
        </div>
    );
};

export default NotFound;
