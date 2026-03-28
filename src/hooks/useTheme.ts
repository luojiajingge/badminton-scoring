import { useStore } from '../store';

export const useTheme = () => {
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return { theme, toggleTheme };
};
