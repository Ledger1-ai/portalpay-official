'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

type ThemeColor = 'primary' | 'blue' | 'orange' | 'purple' | 'green';

interface GeometricBackgroundProps {
    theme?: ThemeColor;
}

export default function GeometricBackground({ theme = 'primary' }: GeometricBackgroundProps) {
    const colors = useMemo(() => {
        switch (theme) {
            case 'blue':
                return ['bg-blue-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-blue-300'];
            case 'orange':
                return ['bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-red-500'];
            case 'purple':
                return ['bg-purple-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-indigo-500'];
            case 'green':
                return ['bg-emerald-500', 'bg-green-500', 'bg-teal-500', 'bg-lime-500'];
            case 'primary':
            default:
                // Using css vars for primary if possible, but framer motion needs explicit classes often better for this simple approach
                // We'll stick to amber/orange/primary-like scale for the default "Basalt" feel
                return ['bg-[var(--primary)]', 'bg-amber-400', 'bg-orange-500', 'bg-yellow-400'];
        }
    }, [theme]);

    // Generate random shapes
    const shapes = useMemo(() => {
        return Array.from({ length: 15 }).map((_, i) => ({
            id: i,
            size: Math.random() * 100 + 50, // 50-150px
            x: Math.random() * 100, // %
            y: Math.random() * 100, // %
            rotation: Math.random() * 360,
            duration: Math.random() * 20 + 10,
            delay: Math.random() * 5,
            type: Math.random() > 0.5 ? 'square' : 'circle', // simple shapes
            color: colors[Math.floor(Math.random() * colors.length)],
            opacity: Math.random() * 0.1 + 0.05, // 0.05 - 0.15 opacity (very subtle)
        }));
    }, [colors]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {shapes.map((shape) => (
                <motion.div
                    key={shape.id}
                    className={`absolute ${shape.color} ${shape.type === 'circle' ? 'rounded-full' : 'rounded-3xl'}`}
                    style={{
                        width: shape.size,
                        height: shape.size,
                        left: `${shape.x}%`,
                        top: `${shape.y}%`,
                        opacity: shape.opacity,
                    }}
                    animate={{
                        y: [0, -30, 0], // Float up and down
                        rotate: [shape.rotation, shape.rotation + 45, shape.rotation], // Rotate gently
                        scale: [1, 1.1, 1], // Pulse
                    }}
                    transition={{
                        duration: shape.duration,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: shape.delay,
                    }}
                />
            ))}

            {/* Overlay to ensure text readability gradient fade out at bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
        </div>
    );
}
