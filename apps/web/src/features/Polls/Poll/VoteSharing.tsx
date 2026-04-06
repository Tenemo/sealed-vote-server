import { Copy } from 'lucide-react';
import React from 'react';

import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'absolute';
  textArea.style.left = '-9999px';

  document.body.append(textArea);
  textArea.select();
  document.execCommand('copy');
  textArea.remove();
};

const VoteSharing = (): React.JSX.Element => {
  const handleCopyLink = (): void => {
    void copyTextToClipboard(window.location.href);
  };

  return (
    <div className="flex w-full justify-center">
      <div className="w-full p-4 sm:w-10/12 md:w-8/12 lg:w-6/12 xl:w-4/12">
        <Field>
          <FieldLabel className="sr-only" htmlFor="voteLink">
            Vote link
          </FieldLabel>
          <FieldContent>
            <div className="relative">
              <Input
                aria-describedby="copy-page-link-helper-text"
                className="overflow-hidden pr-10 text-ellipsis"
                id="voteLink"
                readOnly
                value={window.location.href}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Copy vote link"
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    onClick={handleCopyLink}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Copy className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy to clipboard</TooltipContent>
              </Tooltip>
            </div>
            <FieldDescription
              className="mt-1 text-center"
              id="copy-page-link-helper-text"
            >
              Link to the vote to share with others
            </FieldDescription>
          </FieldContent>
        </Field>
      </div>
    </div>
  );
};

export default VoteSharing;
