'use strict';

const Stripe = require('stripe');
const cfg = require('../agency.config');

const stripe = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

// Tier id -> { name, cents } for the paid plans. Basic is free and never
// goes through Stripe. Keep these in sync with SUBSCRIPTION_TIERS in
// server/routes/prime.js.
const PAID_TIERS = {
    pro:        { name: 'EVOGovCon Prime — Pro',        cents: 4900 },
    enterprise: { name: 'EVOGovCon Prime — Enterprise',  cents: 9900 }
};

function isConfigured() {
    return !!stripe;
}

function requireStripe() {
    if (!stripe) throw new Error('Stripe is not configured (missing STRIPE_SECRET_KEY).');
    return stripe;
}

// Creates a hosted Checkout Session for a prime to subscribe to a paid tier.
async function createCheckoutSession(prime, tier) {
    const plan = PAID_TIERS[tier];
    if (!plan) throw new Error(`Unknown paid tier: ${tier}`);
    const s = requireStripe();

    const session = await s.checkout.sessions.create({
        mode: 'subscription',
        client_reference_id: String(prime.id),
        customer: prime.stripe_customer_id || undefined,
        customer_email: prime.stripe_customer_id ? undefined : prime.email,
        line_items: [{
            quantity: 1,
            price_data: {
                currency: 'usd',
                unit_amount: plan.cents,
                recurring: { interval: 'month' },
                product_data: { name: plan.name }
            }
        }],
        subscription_data: {
            metadata: { primeId: String(prime.id), tier }
        },
        metadata: { primeId: String(prime.id), tier },
        success_url: `${cfg.baseUrl}/prime/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cfg.baseUrl}/prime/billing/cancel`
    });

    return session;
}

// Creates a Stripe Billing Portal session so a prime can manage/cancel their
// own subscription and payment method.
async function createPortalSession(customerId) {
    const s = requireStripe();
    const session = await s.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${cfg.baseUrl}/prime/billing`
    });
    return session;
}

function constructWebhookEvent(rawBody, signature) {
    const s = requireStripe();
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('Stripe webhook secret is not configured (missing STRIPE_WEBHOOK_SECRET).');
    }
    return s.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
    stripe,
    isConfigured,
    requireStripe,
    PAID_TIERS,
    createCheckoutSession,
    createPortalSession,
    constructWebhookEvent
};
