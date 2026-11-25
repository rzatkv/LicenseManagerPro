<?php
/**
 * License Manager Pro — Joomla DI service provider.
 *
 * Registers the component, its MVC factory and its dispatcher
 * factory under the Licensemanagerpro\Component\Licensemanagerpro
 * namespace (Joomla 4/5 native component bootstrap).
 */

declare(strict_types=1);

use Joomla\CMS\Dispatcher\ComponentDispatcherFactoryInterface;
use Joomla\CMS\Extension\ComponentInterface;
use Joomla\CMS\Extension\Service\Provider\ComponentDispatcherFactory;
use Joomla\CMS\Extension\Service\Provider\MVCFactory;
use Joomla\CMS\MVC\Factory\MVCFactoryInterface;
use Joomla\DI\Container;
use Joomla\DI\ServiceProviderInterface;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Extension\LicensemanagerproComponent;

return new class () implements ServiceProviderInterface {
    public function register(Container $container): void
    {
        $container->registerServiceProvider(new MVCFactory('\\Licensemanagerpro\\Component\\Licensemanagerpro'));
        $container->registerServiceProvider(new ComponentDispatcherFactory('\\Licensemanagerpro\\Component\\Licensemanagerpro'));
        $container->set(
            ComponentInterface::class,
            static function (Container $container): LicensemanagerproComponent {
                $component = new LicensemanagerproComponent(
                    $container->get(ComponentDispatcherFactoryInterface::class)
                );
                $component->setMVCFactory($container->get(MVCFactoryInterface::class));
                return $component;
            }
        );
    }
};
