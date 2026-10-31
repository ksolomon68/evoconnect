module.exports = {
    name:            'EVOGovCon',
    shortName:       'EVOGovCon',
    tagline:         'Connect the Contract. Build the Future.',
    domain:          process.env.DOMAIN || 'darkslategrey-partridge-695960.hostingersite.com',
    intendedDomain:  'evogovcon.com',
    appId:           'net.evobrand.evoconnect',
    baseUrl:         (process.env.APP_URL || `https://${process.env.DOMAIN || 'darkslategrey-partridge-695960.hostingersite.com'}`).replace(/\/$/, ''),
    description:     'Government contract workforce ecosystem for skilled workers, small businesses, and prime contractors.',
    themeColor:      '#0F172A',
    backgroundColor: '#0F172A',
    logoPath:        'images/evogovcon-logo.png',
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
        cyan:  '#14B8A6', // Premium Teal
        amber: '#0D9488', // Premium Teal dark/interactive
        light: '#F8FAFC',
    }
};
