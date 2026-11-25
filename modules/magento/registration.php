<?php
/**
 * License Manager Pro — Magento 2 module registration.
 *
 * @copyright Copyright (c) LicenseManagerPro
 * @license   Proprietary
 */

declare(strict_types=1);

use Magento\Framework\Component\ComponentRegistrar;

ComponentRegistrar::register(
    ComponentRegistrar::MODULE,
    'Lmp_LicenseManager',
    __DIR__
);
