import { useIsFocused } from "@react-navigation/native";
import { useEffect } from "react";

type FocusAction = () => void | Promise<void>;

export function useFocusRefresh(action: FocusAction) {
    const isFocused = useIsFocused();

    useEffect(() => {
        if (isFocused) {
            void action();
        }
    }, [isFocused, action]);
}