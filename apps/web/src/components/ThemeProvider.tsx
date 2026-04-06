import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderState = {
    theme: Theme;
    setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState>({
    theme: 'dark',
    setTheme: () => undefined,
});

export const ThemeProvider = ({
    children,
    defaultTheme = 'dark',
    storageKey = 'sv-theme',
}: {
    children: ReactNode;
    defaultTheme?: Theme;
    storageKey?: string;
}): React.JSX.Element => {
    const [theme, setTheme] = useState<Theme>(
        () => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
    );

    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');

        const resolvedTheme =
            theme === 'system'
                ? matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light'
                : theme;

        root.classList.add(resolvedTheme);
        root.style.colorScheme = resolvedTheme;
    }, [theme]);

    return (
        <ThemeProviderContext.Provider
            value={{
                theme,
                setTheme: (nextTheme) => {
                    localStorage.setItem(storageKey, nextTheme);
                    setTheme(nextTheme);
                },
            }}
        >
            {children}
        </ThemeProviderContext.Provider>
    );
};

export const useTheme = (): ThemeProviderState =>
    useContext(ThemeProviderContext);
