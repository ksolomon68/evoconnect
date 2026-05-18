module.exports = {
    name:            'EvoConnect',
    shortName:       'EvoConnect',
    tagline:         'Connect the Contract. Build the Future.',
    domain:          process.env.DOMAIN || 'darkslategrey-partridge-695960.hostingersite.com',
    appId:           'net.evobrand.evoconnect',
    description:     'Government contract workforce ecosystem for skilled workers, small businesses, and prime contractors.',
    themeColor:      '#0F172A',
    backgroundColor: '#0F172A',
    logoPath:        'images/logo-light.png',
    brandFamily:     'PrimeReach',
    owner:           'EVOBRAND Concepts',
    ownerUrl:        'https://evobrand.net',
    ownerPhone:      '214-531-4427',
    email:           process.env.EMAIL_FROM || 'info@evoconnect.evobrand.net',
    supportEmail:    process.env.SUPPORT_EMAIL || 'support@evoconnect.evobrand.net',
    storagePrefix:   'evo',
    address:         { street: '', city: 'Dallas', state: 'TX', zip: '' },
    colors: {
        slate: '#0F172A',
        cyan:  '#06B6D4',
        amber: '#2563EB', // High-end official Cobalt Blue
        light: '#F8FAFC',
    }
};
