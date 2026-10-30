'use strict';

// Stripe webhook handler. Mounted directly on the app (not under /api with
// the rest of the JSON-parsed routes) because signature verification needs
// the exact raw request body — see server/index.js for why this is
// registered before the global express.json() middleware.

const express = require('express');
const { getDb } = require('../database');
const { constructWebhookEvent, isConfigured } = require('../services/stripe');

const router = express.Router();

function mapStripeStatus(status) {
    if (status === 'active' || status === 'trialing') return 'active';
    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'past_due';
    return 'canceled';
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!isConfigured()) {
        console.error('EVOConnected [stripe webhook]: received event but Stripe is not configured.');
        return res.sendStatus(503);
    }

    let event;
    try {
        event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
    } catch (err) {
        console.error('EVOConnected [stripe webhook] signature verification failed:', err.message);
        return res.sendStatus(400);
    }

    try {
        const db = getDb();

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                if (session.mode !== 'subscription') break;
                const primeId = Number(session.client_reference_id || session.metadata?.primeId);
                const tier = session.metadata?.tier;
                if (!primeId || !tier) break;
                await db.execute(
                    `UPDATE primes
                     SET stripe_customer_id = ?, stripe_subscription_id = ?,
                         subscription_tier = ?, subscription_status = 'active'
                     WHERE id = ?`,
                    [session.customer, session.subscription, tier, primeId]
                );
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const primeId = Number(sub.metadata?.primeId);
                const tier = sub.metadata?.tier;
                const status = mapStripeStatus(sub.status);
                if (primeId && tier) {
                    await db.execute(
                        `UPDATE primes SET subscription_tier = ?, subscription_status = ? WHERE id = ?`,
                        [tier, status, primeId]
                    );
                } else {
                    await db.execute(
                        `UPDATE primes SET subscription_status = ? WHERE stripe_subscription_id = ?`,
                        [status, sub.id]
                    );
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                await db.execute(
                    `UPDATE primes
                     SET subscription_tier = 'basic', subscription_status = 'none', stripe_subscription_id = NULL
                     WHERE stripe_subscription_id = ?`,
                    [sub.id]
                );
                break;
            }

            default:
                break;
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('EVOConnected [stripe webhook] handler error:', err);
        res.sendStatus(500);
    }
});

module.exports = router;
