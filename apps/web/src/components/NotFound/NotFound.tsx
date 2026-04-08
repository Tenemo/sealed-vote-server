import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import {
    actionButtonClassName,
    mutedBodyClassName,
    pageTitleClassName,
} from '@/lib/uiClasses';

const NotFound = (): React.JSX.Element => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const onClick = (): void => {
        void navigate('/');
    };

    return (
        <div className="flex flex-1 items-center justify-center">
            <Panel className="w-full max-w-xl space-y-4 text-center">
                <h1 className={pageTitleClassName}>Page not found</h1>
                <div className="space-y-2">
                    <p className={mutedBodyClassName}>
                        The requested path does not exist.
                    </p>
                    <p className="break-all rounded-md bg-accent px-4 py-3 text-sm font-medium text-foreground">
                        {pathname}
                    </p>
                </div>
                <div className="flex justify-center">
                    <Button
                        className={actionButtonClassName}
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
