import React from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function ToggleSwitch({ value, onValueChange, disabled }: ToggleSwitchProps) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={[styles.container, value ? styles.on : styles.off, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={[styles.circle, value ? styles.circleOn : styles.circleOff]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eee',
    borderWidth: 1,
    borderColor: '#ccc',
    transitionDuration: '200ms',
  },
  on: {
    backgroundColor: '#4ade80', // green
    borderColor: '#22c55e',
  },
  off: {
    backgroundColor: '#e5e7eb', // gray
    borderColor: '#ccc',
  },
  disabled: {
    opacity: 0.5,
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
    transitionDuration: '200ms',
  },
  circleOn: {
    transform: [{ translateX: 18 }],
  },
  circleOff: {
    transform: [{ translateX: 0 }],
  },
});
