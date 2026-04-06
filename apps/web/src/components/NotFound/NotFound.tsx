import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';

const NotFound = (): React.JSX.Element => {
    const navigate = useNavigate();
    const onClick = (): void => {
        void navigate('/');
    };

    return (
        <div className="flex h-1/2 items-center justify-center">
            <div className="flex flex-col items-center justify-center">
                <p>
                    Path <strong>{window.location.pathname}</strong> not found.
                </p>
                <Button className="mt-2" onClick={onClick} variant="outline">
                    Go back to vote creation
                </Button>
            </div>
        </div>
    );
};

export default NotFound;
