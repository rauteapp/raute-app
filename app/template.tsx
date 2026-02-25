
'use client'

import { motion } from 'framer-motion'

export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
                duration: 0.2,
                ease: [0.25, 0.1, 0.25, 1.0], // iOS standard ease
            }}
        >
            {children}
        </motion.div>
    )
}
