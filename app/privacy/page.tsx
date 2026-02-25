import React from 'react';

export default function PrivacyPolicy() {
    return (
        <div className="max-w-4xl mx-auto p-8 py-12 prose dark:prose-invert safe-area-p">
            <h1>Privacy Policy</h1>
            <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

            <h2>1. Introduction</h2>
            <p>
                Welcome to Raute ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website.
            </p>

            <h2>2. Information We Collect</h2>
            <p>We collect information that you provide strictly for the purpose of route optimization and fleet management:</p>
            <ul>
                <li><strong>Account Information:</strong> Name, email address, and company details required for account creation.</li>
                <li><strong>Driver Data:</strong> Names and vehicle types of drivers added to your fleet.</li>
                <li><strong>Location Data:</strong> Real-time GPS location data collected ONLY from driver accounts while the app is active to facilitate route tracking and optimization.</li>
                <li><strong>Order Data:</strong> Customer addresses and delivery details uploaded for route planning.</li>
                <li><strong>Images:</strong> Proof of delivery photos uploaded by drivers.</li>
            </ul>

            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
                <li>Provide, operate, and maintain the Raute application.</li>
                <li>Calculate optimized routes for your fleet.</li>
                <li>Process payments and manage subscriptions.</li>
                <li>Send administrative information, such as updates and security alerts.</li>
            </ul>

            <h2>4. Data Sharing</h2>
            <p>
                We do not sell your personal data. We may share data with third-party vendors (e.g., payment processors like RevenueCat/Stripe, map service providers) strictly to perform services for us.
            </p>

            <h2>5. Data Retention & Deletion</h2>
            <p>
                We retain your information only as long as necessary. You may request the deletion of your account and all associated data directly within the application settings ("Delete Account" option) or by contacting support.
            </p>

            <h2>6. Contact Us</h2>
            <p>
                If you have questions about this Privacy Policy, please contact us at support@raute.io.
            </p>
        </div>
    );
}
