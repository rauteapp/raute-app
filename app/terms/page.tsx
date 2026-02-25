import React from 'react';

export default function TermsOfService() {
    return (
        <div className="max-w-4xl mx-auto p-8 py-12 prose dark:prose-invert safe-area-p">
            <h1>Terms of Service</h1>
            <p className="text-sm text-gray-500">Last updated: {new Date().toLocaleDateString()}</p>

            <h2>1. Agreement to Terms</h2>
            <p>
                By accessing or using Raute, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the service.
            </p>

            <h2>2. Subscriptions & Payments</h2>
            <p>
                Raute is a subscription-based service.
            </p>
            <ul>
                <li><strong>Pricing:</strong> $20 USD per block of 5 drivers per month.</li>
                <li><strong>Billing:</strong> Payments are processed via Apple App Store (iOS) or Stripe (Web). Subscriptions auto-renew unless canceled at least 24 hours before the period ends.</li>
                <li><strong>Cancellations:</strong> You can manage or cancel your subscription in your device settings or account profile.</li>
            </ul>

            <h2>3. User Responsibilities</h2>
            <p>
                You are responsible for maintaining the confidentiality of your account and for all activities deemed to be "authorized" use of your account. You agree not to use the app for any illegal or unauthorized purpose.
            </p>

            <h2>4. Driver Safety</h2>
            <p>
                Raute provides route optimization but does not guarantee road safety or real-time traffic accuracy. Drivers must obey all traffic laws and use their judgment. Raute is not liable for accidents or penalties incurred while using the app.
            </p>

            <h2>5. Termination</h2>
            <p>
                We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
            </p>

            <h2>6. Governing Law</h2>
            <p>
                These Terms shall be governed and construed in accordance with the laws of the United States.
            </p>

            <h2>7. Contact Us</h2>
            <p>
                For any questions regarding these Terms, please contact us at support@raute.io.
            </p>
        </div>
    );
}
